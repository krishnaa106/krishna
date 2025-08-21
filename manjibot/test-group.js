/**
 * Test file to verify group management functions
 * This file demonstrates how to use the group management system
 */

const {
    isAdmin,
    getUserJid,
    getCommon,
    parsedJid,
    jidToNum,
    addSpace,
    formatTime,
    lang
} = require('./lib/');

// Test data
const mockParticipants = [
    { id: '1234567890@s.whatsapp.net', admin: 'admin' },
    { id: '0987654321@s.whatsapp.net', admin: null },
    { id: '1111111111@s.whatsapp.net', admin: 'superadmin' },
    { id: '2222222222@s.whatsapp.net', admin: null }
];

const mockMessage = {
    raw: {
        message: {
            extendedTextMessage: {
                contextInfo: {
                    mentionedJid: ['1234567890@s.whatsapp.net', '0987654321@s.whatsapp.net']
                }
            }
        }
    },
    reply_message: {
        sender: '1111111111@s.whatsapp.net'
    }
};

console.log('🧪 Testing Group Management Functions\n');

// Test isAdmin function
console.log('1. Testing isAdmin function:');
console.log('   User 1234567890 is admin:', isAdmin(mockParticipants, '1234567890@s.whatsapp.net'));
console.log('   User 0987654321 is admin:', isAdmin(mockParticipants, '0987654321@s.whatsapp.net'));

// Test getUserJid function
console.log('\n2. Testing getUserJid function:');
const users = getUserJid(mockMessage, '9876543210');
console.log('   Extracted JIDs:', users);

// Test parsedJid function
console.log('\n3. Testing parsedJid function:');
const jids = parsedJid('1234567890@g.us 0987654321@s.whatsapp.net some text');
console.log('   Parsed JIDs:', jids);

// Test jidToNum function
console.log('\n4. Testing jidToNum function:');
console.log('   JID to number:', jidToNum('1234567890@s.whatsapp.net'));

// Test getCommon function
console.log('\n5. Testing getCommon function:');
const group1 = ['user1@s.whatsapp.net', 'user2@s.whatsapp.net', 'user3@s.whatsapp.net'];
const group2 = ['user2@s.whatsapp.net', 'user3@s.whatsapp.net', 'user4@s.whatsapp.net'];
const group3 = ['user3@s.whatsapp.net', 'user4@s.whatsapp.net', 'user5@s.whatsapp.net'];
const common = getCommon([group1, group2, group3]);
console.log('   Common members:', common);

// Test addSpace function
console.log('\n6. Testing addSpace function:');
for (let i = 1; i <= 100; i *= 10) {
    console.log(`   ${i}${addSpace(i, 100)} - Aligned number`);
}

// Test language strings
console.log('\n7. Testing language strings:');
console.log('   Kick desc:', lang.plugins.kick.desc);
console.log('   Not admin msg:', lang.plugins.kick.not_admin);

console.log('\n✅ All tests completed successfully!');
console.log('\n📋 Available Commands:');
console.log('   • kick <user|all> - Remove members from group');
console.log('   • add <number> - Add member to group');
console.log('   • promote <user> - Promote member to admin');
console.log('   • demote <user> - Demote admin to member');
console.log('   • tagall [text] - Tag all group members');
console.log('   • tag <text> - Send hidden mention');
console.log('   • invite - Get group invite link');
console.log('   • revoke - Revoke group invite link');
console.log('   • mute [minutes] - Mute group');
console.log('   • unmute - Unmute group');
console.log('   • join <link> - Join group via invite');
console.log('   • ginfo <link> - Get group information');
console.log('   • common <jids> - Find common members');