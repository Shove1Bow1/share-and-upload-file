require('dotenv').config();
const knex=require('knex')({
    client:'mysql2',
    connection:{
        host: process.env.HOST_RSB || '127.0.0.1',
        port: process.env.PORT_RSB,
        user: process.env.USER_RSB,
        password:  process.env.PASS_RSB ,
        database: process.env.DB_RSB 
    },
    pool: {min: 0, max: 1},
})
module.exports={
    knex
}