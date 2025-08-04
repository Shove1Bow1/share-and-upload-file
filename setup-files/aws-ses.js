require('dotenv').config()
const {SESClient}= require("@aws-sdk/client-ses");
const sesClient=new SESClient({
    region: process.env.AWS_REGION
})
module.exports=sesClient