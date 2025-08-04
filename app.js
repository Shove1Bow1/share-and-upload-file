const express = require("express")
const bodyParser = require('body-parser')
const session = require("express-session")
const multer = require('multer');
const fs = require('fs');
const path = require('path')
const app = express()
const { PassThrough } = require('stream')
const { cryptofile, registration, accountValidation, uploadSharingFile, cryptoEmailReference, insertRefEmail, seperateEmail, sendingMail, retrieveOwner, retrieveRefEmail, retrieveFileObject, downloadFileFromS3, isChecked, deleteFile, existAccount, validateUserName } = require("./functions/functions.js")
const upload = multer({ dest: './upload/' })
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "upload file",
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 5 * 60 * 60 * 1000, secure: false }
}))
app.use(bodyParser.json())
app.set('view engine', 'pug')
app.set('views', './views')
app.get('/', (req, res) => {
    res.render('main-page')
})
app.get('/login', (req, res) => {
    if (req.session.userId) {
        res.redirect('home')
    }
    else
        res.render('login')
})
app.get('/register', (req, res) => {
    if (req.session.userId) {
        res.redirect('home')
    }
    else
        res.render('register')
})
app.post('/register', async (req, res) => {
    const { username, password, email, confirmation_password } = req.body
    const { error, isChecked } = validateUserName(username);
    if (isChecked) {
        res.render('register', { errors: error })
    }
    if (password != confirmation_password) {
        res.render('register', {
            errors: "password and confirmation password doesn't match"
        })
    }
    else {
        console.log(username);
        const account = await existAccount(email, username, res);
        console.log(account);
        if (account) {
            const user = await registration(username, password, email)
            req.session.userId = user.user_id
            req.session.userName = user.user_name
            if (user)
                res.redirect('home')
        }
        res.render('register',{errors: "Account already created"});
    }
})
app.get('/home', (req, res) => {
    try {
        if (!req.session.userId) {
            res.redirect('login')
        }
        else
            res.render('home', { username: req.session.userName })
    }
    catch (e) {
        res.redirect('login')
    }


})
app.get('/view-file', async (req, res) => {
    const refEmail = await retrieveRefEmail(req.query.id);

    if (!refEmail.is_checked) {
        req.session.emailRef = req.query.id;
        const file = await retrieveFileObject(refEmail.file_id)
        const user = await retrieveOwner(file.user_id)
        const splitName = file.file_name.split('.');
        const mimetype = splitName[splitName.length - 1];
        res.render('view-file', {
            fileName: file.file_name,
            owner: user.email,
            fileType: mimetype,
            fileId: file.file_id,
        })

    }
    else {
        res.redirect('/');
    }
})
app.get('/download/', async (req, res) => {
    const fileId = req.query.file_id;
    const fileName = req.query.file_name
    await downloadFileFromS3(fileId, fileName, res);
    const refEmail = await retrieveRefEmail(req.session.emailRef);
    req.session.emailRef = null;
    await isChecked(refEmail);
    await deleteFile(fileId);
})
app.get('/logout', async (req, res) => {
    req.session.destroy();
    res.redirect("/")
})
app.post('/sharing-file', upload.single('file'), async (req, res) => {
    try {
        if (req.session.userId) {
            if (!req.file) {
                return res.render('home', { error: 'Please choose 1 of files' });
            }
            if (!req.body.emails) {
                return res.render('home', { error: 'Please enter some emails to share' })
            }

            const emails = await seperateEmail(req.body.emails);

            const user = await retrieveOwner(req.session.userId)
            const fileId = cryptofile(req.file.originalname)
            const fileContent = fs.readFileSync(req.file.path);
            await uploadSharingFile(fileContent, req.file.mimetype, req.file.originalname, req.session.userId, fileId)
            fs.unlinkSync(req.file.path);
            emails.forEach(email => {
                const emailId = cryptoEmailReference(email.trim(), fileId)
                insertRefEmail(email.trim(), req.session.userId, fileId, emailId)
                sendingMail(email.trim(), emailId, user.email)
            });
            res.redirect('home');
        }
        else res.redirect("/")

    }
    catch (e) {
        res.redirect("/")
    }
})
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { error, isChecked } = validateUserName(username);
    if (isChecked) {
        res.render('login', {
            error
        })
    }
    const userExistion = await accountValidation(username, password);
    if (userExistion) {
        req.session.userId = await userExistion.user_id;
        req.session.userName = await userExistion.user_name;
        res.redirect('/home')
    }

    else
        res.render('login', {
            error: "this account doesn't exist"
        })
})
app.listen(3000, () => { console.log("listten on port: 3000") })
