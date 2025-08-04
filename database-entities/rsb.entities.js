#! THIS DATABASE FOR USERS, files, BUCKETS

const { knex } = require("../setup-files/knex")
async function createUsers() {
    await knex.schema.hasTable('users').then(function (exists) {
        if (!exists) {
            return knex.schema.createTable('users', function (table) {
                table.primary(['user_id']);
                table.string('user_id', 100).unique().notNullable();
                table.string('user_name', 100).unique().notNullable();
                table.string('password', 100).notNullable();
                table.string('email', 100).unique().notNullable();
            })
        }
    })
}
async function createfiles() {
    await knex.schema.hasTable('files').then(function (exist) {
        if (!exist) {
            return knex.schema.createTable('files', function (table) {
                table.primary(['file_id', 'user_id']);
                table.string('file_id', 100).notNullable();
                table.string('file_name', 100)
                table.string('user_id', 100).notNullable();
                table.string('file_link', 200).notNullable();
                table.boolean('is_delete').defaultTo(false);
                table.foreign('user_id').references('user_id').inTable('users').withKeyName('fK_user_file')
            })
        }
    })
}
async function createSharingPoint(){
    await knex.schema.hasTable('sharing_file').then(function(exist){
        if(!exist){
            return knex.schema.createTable('sharing_file', function (table){
                table.primary(['id']);
                table.string('id').notNullable();
                table.string('file_id',100).notNullable();
                table.string('user_id',100).notNullable();
                table.string('email_reference',100).notNullable();
                table.boolean('is_checked').defaultTo(false);
                table.foreign(['file_id','user_id']).references(['file_id','user_id']).inTable('files').withKeyName('fk_file_sharing_link');
            })
        }
    })
}
createUsers()
createfiles()
createSharingPoint()
module.exports = knex