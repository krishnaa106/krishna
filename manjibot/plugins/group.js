const { bot, lang } = require('../lib/');

bot({
    pattern: 'promote ?(.*)',
    desc: lang.plugins.promote.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const users = manji.getUsers(message, match);
    if (!users.length) return message.send(lang.plugins.promote.noUser);

    // Allow if sender is admin OR sudo
    if (!(await manji.isAdmin(message.chat, message.sender)) && !message.isSudo) {
        return message.send(lang.plugins.promote.notAllowed);
    }

    if (!(await manji.isBotAdmin(message.chat))) {
        return message.send(lang.plugins.promote.botNotAdmin);
    }

    let results = [];
    for (const user of users) {
        try {
            if (await manji.isAdmin(message.chat, user)) {
                results.push(lang.plugins.promote.alreadyAdmin.format(`@${manji.toNum(user)}`));
                continue;
            }

            if (!(await manji.isMember(message.chat, user))) {
                results.push(lang.plugins.promote.notMember.format(`@${manji.toNum(user)}`));
                continue;
            }

            await manji.promote(message.chat, user);
            results.push(lang.plugins.promote.success.format(`@${manji.toNum(user)}`));
        } catch (error) {
            results.push(lang.plugins.promote.error.format(`@${manji.toNum(user)}`, error.message));
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});

bot({
    pattern: 'demote ?(.*)',
    desc: lang.plugins.demote.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const users = manji.getUsers(message, match);
    if (!users.length) return message.send(lang.plugins.demote.noUser);

    // Allow if sender is admin OR sudo
    if (!(await manji.isAdmin(message.chat, message.sender)) && !message.isSudo) {
        return message.send(lang.plugins.demote.notAllowed);
    }

    if (!(await manji.isBotAdmin(message.chat))) {
        return message.send(lang.plugins.demote.botNotAdmin);
    }

    let results = [];
    for (const user of users) {
        try {
            if (!(await manji.isAdmin(message.chat, user))) {
                results.push(lang.plugins.demote.notAdmin.format(`@${manji.toNum(user)}`));
                continue;
            }

            if (await manji.isSuperAdmin(message.chat, user) && !(await manji.isBotSuperAdmin(message.chat))) {
                results.push(lang.plugins.demote.cantDemoteSuper.format(`@${manji.toNum(user)}`));
                continue;
            }

            const botJid = manji.getBotJid();
            if (user === botJid) {
                const admins = await manji.getAdmins(message.chat);
                if (admins.length <= 1) {
                    results.push(lang.plugins.demote.lastAdmin.format(`@${manji.toNum(user)}`));
                    continue;
                }
            }

            await manji.demote(message.chat, user);
            results.push(lang.plugins.demote.success.format(`@${manji.toNum(user)}`));
        } catch (error) {
            results.push(lang.plugins.demote.error.format(`@${manji.toNum(user)}`, error.message));
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});


bot({
    pattern: 'kick ?(.*)',
    desc: lang.plugins.kick.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const users = manji.getUsers(message, match);
    if (!users.length) return message.send(lang.plugins.kick.noUser);

    // Allow if sender is admin OR sudo
    if (!(await manji.isAdmin(message.chat, message.sender)) && !message.isSudo) {
        return message.send(lang.plugins.kick.notAllowed);
    }

    if (!(await manji.isBotAdmin(message.chat))) {
        return message.send(lang.plugins.kick.botNotAdmin);
    }

    let results = [];
    for (const user of users) {
        try {
            if (!(await manji.isMember(message.chat, user))) {
                results.push(lang.plugins.kick.notMember.format(`@${manji.toNum(user)}`));
                continue;
            }

            // Can't kick superadmin
            if (await manji.isSuperAdmin(message.chat, user)) {
                results.push(lang.plugins.kick.cantKickAdmin.format(`@${manji.toNum(user)}`));
                continue;
            }

            // Can't kick admin if bot is not superadmin
            if (await manji.isAdmin(message.chat, user) && !(await manji.isBotSuperAdmin(message.chat))) {
                results.push(lang.plugins.kick.cantKickAdmin.format(`@${manji.toNum(user)}`));
                continue;
            }

            const botJid = manji.getBotJid();
            if (user === botJid) {
                results.push(lang.plugins.kick.cantKickSelf.format(`@${manji.toNum(user)}`));
                continue;
            }

            await manji.kick(message.chat, user);
            results.push(lang.plugins.kick.success.format(`@${manji.toNum(user)}`));
        } catch (error) {
            results.push(lang.plugins.kick.error.format(`@${manji.toNum(user)}`, error.message));
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});


bot({
    pattern: 'add ?(.*)',
    desc: lang.plugins.add.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const users = manji.getUsers(message, match);
    if (!users.length) return message.send(lang.plugins.add.noUser);

    // Allow if sender is admin OR sudo
    if (!(await manji.isAdmin(message.chat, message.sender)) && !message.isSudo) {
        return message.send(lang.plugins.add.notAllowed);
    }

    if (!(await manji.isBotAdmin(message.chat))) {
        return message.send(lang.plugins.add.botNotAdmin);
    }

    let results = [];
    for (const user of users) {
        try {
            if (await manji.isMember(message.chat, user)) {
                results.push(lang.plugins.add.alreadyMember.format(`@${manji.toNum(user)}`));
                continue;
            }

            await manji.add(message.chat, user);
            results.push(lang.plugins.add.success.format(`@${manji.toNum(user)}`));
        } catch (error) {
            results.push(lang.plugins.add.error.format(`@${manji.toNum(user)}`, error.message));
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});


bot({
    pattern: 'open ?(.*)',
    aliases: ['unmute'],
    desc: lang.plugins.open.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const duration = manji.parse(match);

    await manji.open(message.chat);

    if (duration) {
        await message.send(lang.plugins.open.openedFor.format(manji.format(duration)));

        setTimeout(async () => {
            await manji.close(message.chat);
            await message.send(lang.plugins.open.closedAfter.format(manji.format(duration)));
        }, duration);
    } else {
        await message.send(lang.plugins.open.opened);
    }
});

bot({
    pattern: 'close ?(.*)',
    aliases: ['mute'],
    desc: lang.plugins.close.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const duration = manji.parse(match);

    await manji.close(message.chat);

    if (duration) {
        await message.send(lang.plugins.close.closedFor.format(manji.format(duration)));

        setTimeout(async () => {
            await manji.open(message.chat);
            await message.send(lang.plugins.close.openedAfter.format(manji.format(duration)));
        }, duration);
    } else {
        await message.send(lang.plugins.close.closed);
    }
});


bot({
    pattern: 'disappear ?(.*)',
    desc: lang.plugins.disappear.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const args = match ? match.toLowerCase().split(' ') : [];
    const action = args[0];

    if (!action || !['on', 'off'].includes(action)) {
        return await message.send(lang.plugins.disappear.usage);
    }

    if (action === 'on') {
        const duration = args[1] || '7d';
        await manji.sendEphemeral(message.chat, { text: '_Disappearing messages enabled_' }, duration);
        await message.send(lang.plugins.disappear.enabled.format(duration));
    } else {
        await manji.sendEphemeral(message.chat, { text: '_Disappearing messages disabled_' }, false);
        await message.send(lang.plugins.disappear.disabled);
    }
});

bot({
    pattern: 'gsetting ?(.*)',
    desc: lang.plugins.gsetting.desc,
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    const action = match ? match.toLowerCase() : '';
    if (!['admin', 'all'].includes(action)) {
        return await message.send(lang.plugins.gsetting.usage);
    }

    if (action === 'admin') {
        await manji.restrict(message.chat);
    } else {
        await manji.unrestrict(message.chat);
    }

    await message.send(lang.plugins.gsetting.updated.format(action));
});



bot({
    pattern: 'accept ?(.*)',
    desc: 'Accept join requests',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    let users = [];

    if (match) {
        users = manji.getUsers(message, match);
    } else {
        // Accept all pending requests - this would need to be implemented in manji class
        // For now, just show message
        return await message.send('_Mention users to accept or use .requests to see pending_');
    }

    if (!users.length) return await message.send('_No users specified_');

    let results = [];
    for (const user of users) {
        try {
            await manji.add(message.chat, user);
            results.push(`@${manji.toNum(user)}: Accepted`);
        } catch (error) {
            results.push(`@${manji.toNum(user)}: ${error.message}`);
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});

bot({
    pattern: 'reject ?(.*)',
    desc: 'Reject join requests',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    let users = [];

    if (match) {
        users = manji.getUsers(message, match);
    } else {
        return await message.send('_Mention users to reject or use .requests to see pending_');
    }

    if (!users.length) return await message.send('_No users specified_');

    let results = [];
    for (const user of users) {
        try {
            await manji.kick(message.chat, user);
            results.push(`@${manji.toNum(user)}: Rejected`);
        } catch (error) {
            results.push(`@${manji.toNum(user)}: ${error.message}`);
        }
    }

    return message.send(results.join('\n'), { mentions: users });
});



bot({
    pattern: 'requests',
    desc: 'Show pending join requests',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    try {
        // This functionality would need to be implemented in manji class
        // For now, show a placeholder message
        await message.send('_Join requests feature not yet implemented_');
    } catch (error) {
        console.error('Error getting join requests:', error);
        await message.send('_Failed to get join requests_');
    }
});


bot({
    pattern: 'invite',
    desc: 'Get group invite link',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    try {
        const code = await manji.link(message.chat);
        if (code) {
            await message.send(`https://chat.whatsapp.com/${code}`);
        } else {
            await message.send('_Failed to get invite link. Make sure bot is admin._');
        }
    } catch (error) {
        await message.send('_Im not admin_');
    }
});


bot({
    pattern: 'revoke',
    desc: 'Revoke group invite link',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    try {
        await manji.revoke(message.chat);
        await message.send('_Invite link revoked_');
    } catch (error) {
        await message.send('_Im not an admin_');
    }
});


bot({
    pattern: 'delete',
    aliases: ['del', 'dlt'],
    desc: lang.plugins.delete.desc,
    type: 'group',
}, async (message, match, manji) => {
    if (!message.quoted) return;

    try {
        await manji.del(message.quoted.key);
        await manji.del(message.raw.key);
    } catch (error) {
        await message.send(lang.plugins.delete.failed);
    }
});

bot({
    pattern: 'clear',
    desc: 'Clear all messages in chat',
    type: 'group',
}, async (message, match, manji) => {
    try {
        await manji.clear(message.chat);
        await message.send('_cleared_');
    } catch (error) {
        await message.send('_Failed to clear_');
    }
});

bot({
    pattern: 'ephemeral ?(.*)',
    desc: 'Send ephemeral message [1d|7d|90d] text',
    type: 'group',
}, async (message, match, manji) => {
    if (!match) return await message.send('_Usage: .ephemeral [1d|7d|90d] <text>_');

    const args = match.split(' ');
    let duration = '7d';
    let text = match;

    if (args[0] && ['1d', '7d', '90d'].includes(args[0])) {
        duration = args[0];
        text = args.slice(1).join(' ');
    }

    if (!text.trim()) return await message.send('_Provide text to send_');

    await manji.sendEphemeral(message.chat, { text }, duration);
});


bot({
    pattern: 'join ?(.*)',
    desc: 'Join group using invite link',
    type: 'general',
}, async (message, match, manji) => {
    if (!match) {
        return await message.send('_Provide a WhatsApp group invite link_');
    }

    const inviteCode = match.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/)?.[1];
    if (!inviteCode) {
        return await message.send('_Invalid WhatsApp group link_');
    }

    try {
        const client = manji.client?.sock || manji.client;
        await client.groupAcceptInvite(inviteCode);
        await message.send('_Successfully joined the group_');
    } catch (error) {
        await message.send('_Failed to join group_');
    }
});

bot({
    pattern: 'groupinfo ?(.*)',
    desc: 'Get group info from invite link',
    type: 'general',
}, async (message, match, manji) => {
    if (!match) {
        return await message.send('_Provide a WhatsApp group invite link_');
    }

    const inviteCode = match.match(/chat\.whatsapp\.com\/([a-zA-Z0-9]+)/)?.[1];
    if (!inviteCode) {
        return await message.send('_Invalid WhatsApp group link_');
    }

    try {
        const client = manji.client?.sock || manji.client;
        const groupInfo = await client.groupGetInviteInfo(inviteCode);

        if (groupInfo) {
            const info = `*Group Information*

*Name:* ${groupInfo.subject}
*ID:* ${groupInfo.id}
*Size:* ${groupInfo.size} members
*Created:* ${new Date(groupInfo.creation * 1000).toLocaleDateString()}
*Description:* ${groupInfo.desc || 'No description'}`;

            await message.send(info);
        } else {
            await message.send('_Failed to get group information_');
        }
    } catch (error) {
        await message.send('_Failed to get group information_');
    }
}); 


bot({
    pattern: 'pin',
    desc: 'Pin a message',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    if (!message.quoted) {
        return await message.send('_Reply to a message to pin it_');
    }

    try {
        await manji.stick(message.quoted.key);
        await message.send('_Message pinned_');
    } catch (error) {
        await message.send('_Failed to pin message_');
    }
});

bot({
    pattern: 'unpin',
    desc: 'Unpin a message',
    type: 'group',
    group: true,
}, async (message, match, manji) => {
    if (!message.quoted) {
        return await message.send('_Reply to a pinned message to unpin it_');
    }

    try {
        await manji.unstick(message.quoted.key);
        await message.send('_Message unpinned_');
    } catch (error) {
        await message.send('_Failed to unpin message_');
    }
});

bot({
    pattern: 'star',
    desc: 'Star a message',
    type: 'general',
}, async (message, match, manji) => {
    if (!message.quoted) {
        return await message.send('_Reply to a message to star it_');
    }

    try {
        const client = manji.client?.sock || manji.client;
        await client.chatModify({
            star: {
                messages: [{ key: message.quoted.key, starred: true }]
            }
        }, message.quoted.key.remoteJid);
        await message.send('_Message starred_');
    } catch (error) {
        await message.send('_Failed to star message_');
    }
});

bot({
    pattern: 'unstar',
    desc: 'Unstar a message',
    type: 'general',
}, async (message, match, manji) => {
    if (!message.quoted) {
        return await message.send('_Reply to a starred message to unstar it_');
    }

    try {
        const client = manji.client?.sock || manji.client;
        await client.chatModify({
            star: {
                messages: [{ key: message.quoted.key, starred: false }]
            }
        }, message.quoted.key.remoteJid);
        await message.send('_Message unstarred_');
    } catch (error) {
        await message.send('_Failed to unstar message_');
    }
});

