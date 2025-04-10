const { isBotAdmin, getBotNumber } = require("./lixon");

// ─── Group Role Management ─────────────────────────────────────────────

async function modifyGroupRole(client, msg, args, action) {
    try {
        const groupJid = msg.key.remoteJid;
        if (!groupJid.endsWith("@g.us")) return sendFallback(client, groupJid, "_Use in group!_");

        const chat = await client.groupMetadata(groupJid);
        if (!chat) return sendFallback(client, groupJid, "_Metadata error!_");

        if (!isBotAdmin(client, chat.participants)) return sendFallback(client, groupJid, "_I'm not admin!_");

        let mentioned = getMentionedUsers(msg, args);
        if (!mentioned.length) return sendFallback(client, groupJid, `_Tag/reply to ${action}._`);

        const admins = chat.participants.filter(p => p.admin);
        let validUsers = [];

        for (const user of mentioned) {
            const participant = chat.participants.find(p => p.id === user);
            if (!participant) {
                await client.sendMessage(groupJid, { text: `_@${user.split('@')[0]} not in group!_`, mentions: [user] });
                continue;
            }
            if (participant.admin === "superadmin") {
                await client.sendMessage(groupJid, { text: "_Can't modify creator!_", mentions: [user] });
                continue;
            }
            if ((action === "promote" && participant.admin) || (action === "demote" && !participant.admin)) {
                await client.sendMessage(groupJid, { text: `_@${user.split('@')[0]} already ${action}d!_`, mentions: [user] });
                continue;
            }
            validUsers.push(user);
        }

        if (action === "demote") {
            const remainingAdmins = admins.filter(a => !validUsers.includes(a.id));
            if (remainingAdmins.length === 0) return sendFallback(client, groupJid, "_Can't demote last admin!_");
        }

        if (!validUsers.length) return { isFallback: true };

        try {
            await client.groupParticipantsUpdate(groupJid, validUsers, action);
            await client.sendMessage(groupJid, { 
                text: `✅ ${action.charAt(0).toUpperCase() + action.slice(1)}d: ${validUsers.map(u => `@${u.split('@')[0]}`).join(", ")}`, 
                mentions: validUsers 
            });
        } catch (error) {
            return handleGroupUpdateError(client, groupJid, error);
        }

        return { isFallback: false };

    } catch (err) {
        console.error(`❌ Error in modifyGroupRole:`, err);
        return sendFallback(client, msg.key.remoteJid, "_Unexpected error!_");
    }
}

async function modifyAllGroupRoles(client, msg, action) {
    try {
        const groupJid = msg.key.remoteJid;
        if (!groupJid.endsWith("@g.us")) return sendFallback(client, groupJid, "_Use in group!_");

        const chat = await client.groupMetadata(groupJid);
        if (!chat) return sendFallback(client, groupJid, "_Metadata error!_");

        if (!isBotAdmin(client, chat.participants)) return sendFallback(client, groupJid, "_I'm not admin!_");

        const botJid = getBotNumber(client) + "@s.whatsapp.net";
        let validUsers = [];

        if (action === "promote") {
            validUsers = chat.participants.filter(p => !p.admin && p.id !== botJid).map(p => p.id);
        } else if (action === "demote") {
            const admins = chat.participants.filter(p => p.admin && p.id !== botJid);
            if (admins.length === 0) return sendFallback(client, groupJid, "_No admins to demote!_");

            validUsers = admins.map(p => p.id);
            if (validUsers.length === 1 && validUsers[0] === botJid) {
                return sendFallback(client, groupJid, "_Can't demote last admin!_");
            }
        }

        if (!validUsers.length) return { isFallback: true };

        try {
            await client.groupParticipantsUpdate(groupJid, validUsers, action);
            await client.sendMessage(groupJid, { text: `✅ ${action.charAt(0).toUpperCase() + action.slice(1)}d ${validUsers.length} members.` });
        } catch (error) {
            return handleGroupUpdateError(client, groupJid, error);
        }

        return { isFallback: false };

    } catch (err) {
        console.error(`❌ Error in modifyAllGroupRoles:`, err);
        return sendFallback(client, msg.key.remoteJid, "_Unexpected error!_");
    }
}

// ─── Tagging ────────────────────────────────────────────────────────────

async function tagMembers(client, msg, filterFn) {
    try {
        const chat = await client.groupMetadata(msg.key.remoteJid);
        if (!chat || !chat.participants)
            return client.sendMessage(msg.key.remoteJid, { text: "_Unable to fetch group members._" });

        let mentions = [];
        for (let i = 0; i < chat.participants.length; i++) {
            const m = chat.participants[i];
            if (await filterFn(m, i, chat.participants)) {
                mentions.push(m);
            }
        }

        if (!mentions.length) {
            await client.sendMessage(msg.key.remoteJid, { text: "_No matching members found._" });
            return { isFallback: true };
        }

        const listText = mentions.map((m, i) => `> ${i + 1}. @${m.id.split("@")[0]}`).join("\n");
        const ids = mentions.map(m => m.id);

        await client.sendMessage(msg.key.remoteJid, { text: listText, mentions: ids });
    } catch (err) {
        console.error("❌ Error in tagging command:", err);
        await client.sendMessage(msg.key.remoteJid, { text: "_Failed to tag members. Ensure bot has admin rights._" });
        return { isFallback: true };
    }
}


// ─── Group Settings ─────────────────────────────────────────────────────

async function toggleGroupLock(client, groupJid, lock) {
    try {
        if (!groupJid.endsWith("@g.us")) {
            await client.sendMessage(groupJid, { text: "_This command can only be used in groups!_" });
            return { isFallback: true };
        }

        const chat = await client.groupMetadata(groupJid);
        if (!chat) return sendFallback(client, groupJid, "_Group metadata unavailable._");

        if (!isBotAdmin(client, chat.participants)) return sendFallback(client, groupJid, "_I am not an admin!_");

        await client.groupSettingUpdate(groupJid, lock ? "announcement" : "not_announcement");
        return { isFallback: false };

    } catch (err) {
        console.error(`❌ Error ${lock ? "closing" : "opening"} group:`, err);
        await client.sendMessage(groupJid, { text: `_❌ Failed to ${lock ? "close" : "open"} the group. Make sure I'm an admin._` });
        return { isFallback: true };
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────

function getMentionedUsers(msg, args) {
    let mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (msg.message?.extendedTextMessage?.contextInfo?.participant) {
        mentioned.push(msg.message.extendedTextMessage.contextInfo.participant);
    }
    if (args.length) {
        mentioned.push(...args.map(arg => arg.replace(/\D/g, "") + "@s.whatsapp.net"));
    }
    return [...new Set(mentioned)]; // Remove duplicates
}

async function sendFallback(client, jid, text) {
    await client.sendMessage(jid, { text });
    return { isFallback: true };
}

async function handleGroupUpdateError(client, jid, error) {
    console.error(`❌ Group role error:`, error);
    return sendFallback(client, jid, error.data === 403 ? "_No permission!_" : "_Error occurred!_");
}

// ─── Block and Unblock ────────────────────────────────────────────────

const blockUser = async (client, msg, userToBlock) => {
    let botNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
    
    if (!userToBlock.includes("@s.whatsapp.net")) {
        await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a user's message_" });
        return {isFallback: true};
    }
    
    if (userToBlock === botNumber) {
        await client.sendMessage(msg.key.remoteJid, { text: "_Can't block myself_" });
        return {isFallback: true};
    }
    
    await client.sendMessage(msg.key.remoteJid, { text: "_Blocked_" });
    await client.updateBlockStatus(userToBlock, "block");
};

const unblockUser = async (client, msg, userToUnblock) => {
    let botNumber = client.user.id.split(":")[0] + "@s.whatsapp.net";
    
    if (!userToUnblock.includes("@s.whatsapp.net")) {
        await client.sendMessage(msg.key.remoteJid, { text: "_Reply to a user's message_" });
        return {isFallback: true};
    }
    
    if (userToUnblock === botNumber) {
        await client.sendMessage(msg.key.remoteJid, { text: "_Can't unblock myself_" });
        return {isFallback: true};
    }
    
    await client.sendMessage(msg.key.remoteJid, { text: "_Unblocked_" });
    await client.updateBlockStatus(userToUnblock, "unblock");
};


// ─── Exporting Functions ────────────────────────────────────────────────

module.exports = {
    modifyGroupRole,
    modifyAllGroupRoles,
    tagMembers,
    toggleGroupLock,
    blockUser,
    unblockUser,
};
