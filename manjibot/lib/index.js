const m = require('./utils');
const { Var, Vin } = require('./functions');
const { Manji } = require('./manji');
const lang = require('./lang');

module.exports = {
    // God-level Manji class
    Manji,
    
    // Advanced function classes
    Var,
    Vin,
    m,
    // Core sticker functions - all logic in utils
    sticker: m.sticker ? m.sticker.bind(m) : null,
    toimg: m.toimg ? m.toimg.bind(m) : null,
    exif: m.exif ? m.exif.bind(m) : null,

    // Media functions
    toWebp: m.toWebp ? m.toWebp.bind(m) : null,
    addExif: m.addExif ? m.addExif.bind(m) : null,
    downloadMedia: m.downloadMedia ? m.downloadMedia.bind(m) : null,

    // Utility functions
    formatFileSize: m.formatFileSize ? m.formatFileSize.bind(m) : null,
    formatDuration: m.formatDuration ? m.formatDuration.bind(m) : null,
    cleanup: m.cleanup ? m.cleanup.bind(m) : null,
    sleep: m.sleep ? m.sleep.bind(m) : ((ms) => new Promise(resolve => setTimeout(resolve, ms))),
    parseTime: m.parseTime ? m.parseTime.bind(m) : null,
    formatTime: m.formatTime ? m.formatTime.bind(m) : null,

    // Menu and help functions - all logic in utils
    menu: m.menu ? m.menu.bind(m) : null,
    help: m.help ? m.help.bind(m) : null,

    // Tracker functions - all logic in utils
    addTracker: m.addTracker ? m.addTracker.bind(m) : null,
    removeTracker: m.removeTracker ? m.removeTracker.bind(m) : null,
    toggleTracker: m.toggleTracker ? m.toggleTracker.bind(m) : null,
    getTrackers: m.getTrackers ? m.getTrackers.bind(m) : null,
    processTrackers: m.processTrackers ? m.processTrackers.bind(m) : null,

    // Bot function is globally available via plugin manager
    bot: global.bot,

    // Group management functions
    isAdmin: m.isAdmin ? m.isAdmin.bind(m) : null,
    getUserJid: m.getUserJid ? m.getUserJid.bind(m) : null,
    getCommon: m.getCommon ? m.getCommon.bind(m) : null,
    parsedJid: m.parsedJid ? m.parsedJid.bind(m) : null,
    jidToNum: m.jidToNum ? m.jidToNum.bind(m) : null,
    addSpace: m.addSpace ? m.addSpace.bind(m) : null,
    formatTime: m.formatTime ? m.formatTime.bind(m) : null,
    getGroupMetadata: m.getGroupMetadata ? m.getGroupMetadata.bind(m) : null,
    isBotAdmin: m.isBotAdmin ? m.isBotAdmin.bind(m) : null,
    groupParticipantsUpdate: m.groupParticipantsUpdate ? m.groupParticipantsUpdate.bind(m) : null,
    getInviteCode: m.getInviteCode ? m.getInviteCode.bind(m) : null,
    revokeInvite: m.revokeInvite ? m.revokeInvite.bind(m) : null,
    groupSettingsChange: m.groupSettingsChange ? m.groupSettingsChange.bind(m) : null,
    getGroupInfo: m.getGroupInfo ? m.getGroupInfo.bind(m) : null,
    joinGroup: m.joinGroup ? m.joinGroup.bind(m) : null,

    // Language support
    lang,
};