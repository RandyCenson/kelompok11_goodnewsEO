if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require("express"); // Mengimpor framework Express.js untuk membangun aplikasi web
const dotenv = require("dotenv"); // Memuat variabel lingkungan dari file .env
var multer = require('multer'); // Middleware untuk menangani multipart/form-data, digunakan untuk unggahan file
var jwt = require('jsonwebtoken'); // Implementasi JSON Web Token untuk otentikasi
const mongoose = require('mongoose'); // Alat pemodelan objek MongoDB yang dirancang untuk bekerja dalam lingkungan asinkron
const cookieParser = require('cookie-parser'); // Middleware untuk mem-parsing cookie yang terlampir pada objek permintaan klien
const nodemailer = require('nodemailer'); // Modul untuk mengirim surel
const morgan = require('morgan'); // Middleware logger permintaan HTTP untuk Node.js
const bcrypt = require('bcrypt'); // Perpustakaan untuk meng-hash kata sandi
const collection_dataqueue = require("./models/data_queue"); // Mengimpor model MongoDB untuk antrian data
const collection_userdata = require("./models/data_user"); // Mengimpor model MongoDB untuk data pengguna
const collection_user_login_tracking = require("./models/data_login_tracking"); // Mengimpor model MongoDB untuk pelacakan login pengguna
const collection_file_upload = require("./models/file_upload_home_carousel"); // Mengimpor model MongoDB untuk unggahan file (karusel beranda)
const collection_file_upload_gallery = require("./models/file_upload_gallery"); // Mengimpor model MongoDB untuk unggahan file (galeri)
const secret = 'mysecretkey'; // Kunci rahasia untuk penandatanganan token JWT
const app = express(); // Membuat instansi aplikasi Express

dotenv.config();//
const port = process.env.PORT || 5000; // Mengatur port untuk server mendengarkan


mongoose.connect(process.env.MONGO_URL).then(
    () => console.log(`mongoose(database) connected at ${process.env.MONGO_URL}`),
    err => console.log('error here: ', err),
);



app.use(morgan('start'));

app.use(express.json());

app.use(express.urlencoded({ extended: false }));

app.use(cookieParser());

app.use(express.static("public"));

app.set("view engine", "ejs");

//register
app.post('/register', async (req, res) => {
    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        let datausers = {
            id: Date.now().toString(),
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword
        };
        const data = await collection_userdata.create(datausers);
        console.log(data);
        res.redirect('/login');
    } catch {
        res.redirect('/register');
    }
});


var currUserName; //untuk index
//post login
app.post("/login", async function (req, res) {
    try {
        const username = req.body.username;
        const password = req.body.password;
        if (username === 'admin' && password === 'admin') {
            const token = jwt.sign({ username }, secret, { expiresIn: '60s' });
            res.cookie('token', token, { httpOnly: true });
            console.log("token admin created: " + token);
            res.redirect("/admin");
        }

        else if (username !== "admin") {
            const user = await collection_userdata.findOne({ username: req.body.username });
            if (user) {
                //check if password matches
                const isPasswordMatch = await bcrypt.compare(req.body.password, user.password);
                if (!isPasswordMatch) {
                    return res.status(401).render("login_willy", { messages: "password wrong" });
                }
                else {
                    collection_user_login_tracking.create({ username: username, date: Date.now() });
                    currUserName = username;
                    res.redirect("/index");
                }
            }
            else if (req.body.username === "") {
                return res.status(401).render("login_willy", { messages: "username section is empty" });
            }
            else {
                return res.status(401).render("login_willy", { messages: username + " user not found" });

            }
        }
        else if (req.body.username === "") {
            return res.status(401).render("login_willy", { messages: "username section is empty" });
        }
        else {
            res.status(401).json({ error: 'non-admin user' });
        }

    }
    catch (error) {
        return res.status(401).render("login_willy", { messages: "token is not found" });
    }
});
//verify token fuction
function verifyTokenAdmin(req, res, next) {
    const token = req.cookies.token;
    try {
        const user = jwt.verify(token, secret);
        req.user = user;
        next();
    }
    catch (err) {
        res.redirect("/login");
    }
}

//post logout
app.post('/logout', (req, res, next) => {
    currUserName = '';
    res.redirect('/index');

})

//interaksi admin
app.post("/add_queue", async (req, res) => {
    const data = {
        date: req.body.date,
        orderedby: req.body.orderedby,
        handler: req.body.handler
    }
    const userdata = await collection_dataqueue.insertMany(data);
    console.log(userdata);
    res.redirect("/admin");
})


app.get('/delete_queue/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await collection_dataqueue.deleteOne({ _id: id });
        res.redirect("/admin");
    } catch (error) {
        console.error('Error deleting data:', error);
    }
})

app.post('/update_queue/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await collection_dataqueue.findByIdAndUpdate({ _id: id }, {
            $set: {
                tanggal: req.body.date_update,
                handler: req.body.handler_update,
                orderedby: req.body.orderedby_update,
            }
        })
        res.redirect("/admin");
    } catch (error) {
        console.error('Error updating data:', error);
    }
})

const storage = multer.diskStorage({
    destination: './public/uploads_home_carousel',
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const storage_gallery = multer.diskStorage({
    destination: './public/uploads_gallery',
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

app.post('/home_carousel_img', upload.single('home_carousel_img'), async function (req, res) {
    var data = req.file
    try {
        await collection_file_upload.create({
            //perlu karena expressjs baca file dari public, beda dgn penyimpanan file perlu tulis public/
            //di html gk bisa kebaca kalau ada /public
            img_path: data.path.slice(6),
            field: data.fieldname
        });
        console.log(req.file);
        res.redirect("/admin");
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})
const upload_gallery = multer({ storage: storage_gallery });
app.post('/gallery_img', upload_gallery.single('gallery_img'), async function (req, res) {
    var data = req.file
    try {
        await collection_file_upload_gallery.create({
            img_path: data.path.slice(6),
            field: data.fieldname,
            description: req.body.description,
        });
        console.log(req.file);
        res.redirect("/admin");
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
})


app.get('/delete_home_carousel_img/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await collection_file_upload.deleteOne({ _id: id });
        res.redirect("/admin");
    } catch (error) {
        console.error('Error deleting data:', error);
    }
})

app.get('/delete_gallery_img/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await collection_file_upload_gallery.deleteOne({ _id: id });
        res.redirect("/admin");
    } catch (error) {
        console.error('Error deleting data:', error);
    }
})
//email req

app.post("/sendEmail", async (req, res) => {
    const output = `
    <p>You have a new contact request</p>
    <h3>Contact Details</h3>
    <ul>
    <li>Email: ${req.body.email}</li>
    </ul>
    <h3>about: </h3>
    <p>${req.body.description}</p>
    `;
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'randy.535220175@stu.untar.ac.id',
            pass: 'ufxqsbcwgqlrhhky'
        },
        port: 465, // or 587
        secure: true, // true for 465, false for other ports
        tls: {
            rejectUnauthorized: false
        }
    });
    let mailOptions = {
        from: 'randy.535220175@stu.untar.ac.id',
        to: 'randy.535220175@stu.untar.ac.id',
        subject: 'GoodnewsEO - Contact Request',
        text: 'hi there...',
        html: output
    }
     transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        console.log(error);
        // Display an error message to the user
        res.send("Oops! Something went wrong while sending the email. Please try again later.");
    } else {
        console.log('Message sent: %s', info.messageId);
        // Provide a success message to the user
        res.send("Email sent successfully!");
    }
});


})
//callback url

app.get("/", async (req, res) => {
    try {
        const data_req = await collection_dataqueue.find();
        const data_file_upload_req = await collection_file_upload.find();
        res.render("index.ejs", { title: "Admin", data_queue: data_req, data_file_upload: data_file_upload_req, currUserName: currUserName });
    } catch (err) {
        console.error("Error fetching data:", err);
        // Handle errors appropriately (e.g., render an error page)
    }
});
app.get("/index", async (req, res) => {
    try {
        const data_req = await collection_dataqueue.find();
        const data_file_upload_req = await collection_file_upload.find();
        res.render("index.ejs", { title: "Admin", data_queue: data_req, data_file_upload: data_file_upload_req, currUserName: currUserName });
    } catch (err) {
        console.error("Error fetching data:", err);
        // Handle errors appropriately (e.g., render an error page)
    }
});

app.get("/gallery", async (req, res) => {
    const data_gallery_req = await collection_file_upload_gallery.find();
    res.render("gallery.ejs", { data_gallery: data_gallery_req });
});

app.get("/register", (req, res) => {
    res.render("register.ejs");
});

app.get("/login", (req, res) => {
    res.render("login_willy.ejs", { messages: "" });
})
app.get('/admin', verifyTokenAdmin, async (req, res) => {
    try {
        const data_req = await collection_dataqueue.find();
        const data_user_req = await collection_userdata.find();
        const data_user_login_req = await collection_user_login_tracking.find();
        const data_file_upload_req = await collection_file_upload.find();
        const data_file_upload_gallery_req = await collection_file_upload_gallery.find();
        res.render("admin.ejs", { title: "Admin", data_file_upload_gallery: data_file_upload_gallery_req, data_queue: data_req, data_user: data_user_req, data_user_login: data_user_login_req, data_file_upload: data_file_upload_req });
    } catch (err) {
        console.error("Error fetching data:", err);
    }
});

app.listen(port, () => {
    console.log(`Server listening on porty ${port}`);
});
