require('dotenv').config();
const crypto = require('crypto');
const knex = require('../database-entities/rsb.entities');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { SendEmailCommand } = require('@aws-sdk/client-ses');
const { PassThrough } = require('stream')
const sesClient = require('../setup-files/aws-ses')
const s3Client = require('../setup-files/awss3');
const { Domain } = require('domain');
const os = require('os')
const fs = require('fs')
const path = require('path');
const { pipeline } = require('stream')
const cryptoSecretKey = process.env.CRYPTO_SECRET_KEY
function cryptoPass(password) {
    const hashPass = crypto.createHash('sha256').update(password).digest('base64');
    return hashPass;
}
function cryptofile(fileName) {
    const hashfile = crypto.createHash('sha256').update(Date.now() + fileName).digest('hex');
    return hashfile;
}
function cryptoUserID(username, email) {
    const newRawID = username + email;
    const newID = crypto.createHash('sha256').update(newRawID).digest('hex');
    return newID;
}
function cryptoEmailReference(emailReference, fileName) {
    return crypto.createHash('sha256').update(emailReference + fileName).digest('hex');
}
async function registration(username, password, email) {
    const hashPass = cryptoPass(password);
    const hashId = cryptoUserID(username, email);
    await knex('users').insert({
        user_id: hashId,
        user_name: username,
        password: hashPass,
        email
    })
    const newUser = await retrieveOwner(hashId);
    if (newUser) {
        return newUser;
    }
}
async function accountValidation(username, password) {
    const hashPass = cryptoPass(password);
    const userExistion = (await knex('users').where({ user_name: username, password: hashPass }).first())
    try {
        if (await userExistion.user_id) {
            return userExistion;
        }
    }
    catch (error) {
        return false;
    }

}
function passwordComparer(confirmation_password, password) {
    if (confirmation_password != password) {
        return false;
    }
    else return true;
}
async function uploadSharingFile(fileContent, fileMimeType, fileOriginalName, userId, fileId) {
    await knex('files').insert({
        file_id: fileId,
        file_name: fileOriginalName,
        user_id: userId,
        file_link: `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileId}`,
        is_delete: false,
    })
    const uploadParams = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileId,
        Body: fileContent,
        ContentType: fileMimeType
    }
    const command = new PutObjectCommand(uploadParams);
    await s3Client.send(command)
}
async function insertRefEmail(email, userId, fileId, emailId) {
    return await knex('sharing_file').insert({
        email_reference: email,
        user_id: userId,
        file_id: fileId,
        id: emailId,
        is_checked: false,
    })
}
async function sendingMail(email, emailId, userEmail) {
    const params = {
        Source: process.env.SES_EMAIL,
        Destination: {
            ToAddresses: [email]
        },
        Message: {
            Subject: {
                Charset: "UTF-8",
                Data: 'Shared file from ' + userEmail
            },
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: " This link can only be visited once time, please download the file to save it: " + process.env.FILE_VIEW + '/view-file/?id=' + emailId
                },
                html: {
                    Charset: 'UTF-8',
                    Data: `<a href='${process.env.FILE_VIEW}/view-file/?id=${emailId}'>View File</a>`
                }
            }

        }
    }
    try {
        const command = new SendEmailCommand(params);
        const response = await sesClient.send(command);
        response;
    }
    catch (e) {
        console.log(e)
    }
}
async function retrieveFileObject(fileId) {
    const file = await knex('files').where({ file_id: fileId }).first();
    return file;
}
async function isChecked(refEmail) {
    if (refEmail.is_checked) {
        return false;
    }
    else {
        await knex('sharing_file').where({
            id: refEmail.id
        }).update({ is_checked: true })
        return true;
    }
}
async function seperateEmail(emails) {
    const newEmails = emails.split(/[;,]/);
    return newEmails;
}
async function retrieveOwner(userId, userName) {
    const user = await knex('users').where({
        user_id: userId
    }).orWhere({email:userId || ''}).orWhere({user_name:userName || ''}).first();
    return user;
}
async function retrieveRefEmail(emailId) {
    const emailRef = await knex('sharing_file').where({
        id: emailId
    }).first();
    return emailRef;
}
async function deleteFile(fileId) {
    let isViewed = true;
    const checkAllFile = await knex('sharing_file').where({
        file_id: fileId
    })
    checkAllFile.forEach(refEmail => {
        if (!refEmail.is_checked) {
            isViewed = false;
            return;
        }
    })
    if (!isViewed) { return; }
    await knex('files').where({
        file_id: fileId
    }).update({ is_delete: true })
    const params = {
        Key: fileId,
        Bucket: process.env.BUCKET_NAME
    }
    try {
        const command = new DeleteObjectCommand(params)
        const response = await s3Client.send(command);
        return response;
    }
    catch (e) {
        console.log(e);
    }
}
async function downloadFileFromS3(fileId, originalName, res) {
    const params = {
        Bucket: process.env.BUCKET_NAME,
        Key: fileId,
    }
    try {
        const downloadsPath = path.join(os.homedir(), 'Downloads');
        const localFilePath = path.join(downloadsPath, originalName);
        const fileNameArray = originalName.split('.')
        let newName = "";
        for (let i = 0; i < fileNameArray.length - 1; i++) {
            newName += fileNameArray[i]
        }

        let finalPath = localFilePath;
        let counter = 0;
        while (fs.existsSync(finalPath)) {
            const ext = path.extname(originalName);
            const base = newName
            if (counter == 0) {
                finalPath = path.join(downloadsPath, `${base}${ext}`);
            }
            else
                finalPath = path.join(downloadsPath, `${base}_${counter}${ext}`);
            counter++;
        }
        const fileStream = fs.createWriteStream(finalPath);
        const command = new GetObjectCommand(params);
        const response = await s3Client.send(command);
        const passThrough = new PassThrough()
        await response.Body.pipe(passThrough);
        res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        passThrough.pipe(res);
        passThrough.pipe(fileStream);
        await new Promise((resolve, reject) => {
            fileStream.on('finish', () => {
                resolve(finalPath);
            });
            fileStream.on('error', reject);
        });       
        return;
    }
    catch (e) {
        throw(e)
    }
}
async function fileTypeFilter(fileType){
   
}
async function existAccount(email, userName, res){
    const emailPattern= /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailChecked=email.match(emailPattern);

    if(emailChecked){
        const existEmail=await retrieveOwner(emailChecked[0], userName);
        if(existEmail){
            res.render('/register', {errors: "Email or name is already used"});
            return;
        }
    }

    return emailChecked;
}
function validateUserName(userName){
    const userNameReg=/[a-zA-Z0-9._-]{1,}/g;
    const userNameChecked=userName.match(userNameReg);
    if(userNameChecked){
        return {error:"", isChecked:false};
    }
    return {error:"user name is not valid.\n Valid name conatains characters of letter and number, with _ - .", isChecked:false};
}
module.exports = {
    retrieveOwner,
    isChecked,
    sendingMail,
    cryptofile,
    registration,
    passwordComparer,
    accountValidation,
    uploadSharingFile,
    cryptoEmailReference,
    insertRefEmail,
    seperateEmail,
    retrieveRefEmail,
    retrieveFileObject,
    deleteFile,
    downloadFileFromS3,
    existAccount,
    validateUserName
}