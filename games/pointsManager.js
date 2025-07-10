// games/pointsManager.js
const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "../games");
if (!fs.existsSync(dbPath)) {
    fs.mkdirSync(dbPath, { recursive: true });
}
const pointsDataPath = path.join(dbPath, "points.json");

function loadPointsData() {
    try {
        if (fs.existsSync(pointsDataPath)) {
            return JSON.parse(fs.readFileSync(pointsDataPath, "utf-8"));
        }
    } catch (error) {
        console.error("Error loading points data:", error);
    }
    return {};
}

function savePointsData(data) {
    try {
        fs.writeFileSync(pointsDataPath, JSON.stringify(data, null, 2), "utf-8");
    } catch (error) {
        console.error("Error saving points data:", error);
    }
}

function initPlayerData(jid, pointsData) {
    if (!pointsData[jid]) {
        pointsData[jid] = { points: 0, gamesPlayed: 0 };
    }
    return pointsData;
}

function addPoints(jid, pointsToAdd) {
    const pointsData = loadPointsData();
    pointsData[jid] = pointsData[jid] || { points: 0, gamesPlayed: 0 };
    pointsData[jid].points += pointsToAdd;
    pointsData[jid].gamesPlayed += 1;
    savePointsData(pointsData);
    return pointsData[jid].points;
}

function getPoints(jid) {
    const pointsData = loadPointsData();
    return pointsData[jid]?.points || 0;
}

function getTopPlayers(limit = 10) {
    const pointsData = loadPointsData();
    return Object.entries(pointsData)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, limit)
        .map(([jid, data]) => ({ jid, points: data.points, gamesPlayed: data.gamesPlayed }));
}

module.exports = {
    loadPointsData,
    savePointsData,
    initPlayerData,
    addPoints,
    getPoints,
    getTopPlayers
};