async function getStatusData(client, number) {
    try {
        let statusData = await client.fetchStatus(number);

        if (!Array.isArray(statusData) || statusData.length === 0) {
            return { status: "NO ABOUT AVAILABLE", setAt: "UNKNOWN" };
        }

        let statusObj = statusData[0]?.status || {};

        return {
            status: statusObj?.status?.toString() || "NO ABOUT AVAILABLE",
            setAt: statusObj?.setAt ? new Date(statusObj.setAt).toLocaleString() : "UNKNOWN",
        };
    } catch {
        return { status: "NO ABOUT AVAILABLE", setAt: "UNKNOWN" };
    }
}

async function isOnWhatsApp(client, number) {
    let waNumber = number + "@s.whatsapp.net";
    let result = await client.onWhatsApp(waNumber);
    return result?.[0]?.exists || false;
}


async function isPfp(client, number) {
    let waNumber = number + "@s.whatsapp.net";
    try {
        await client.profilePictureUrl(waNumber, "image");
        return true;
    } catch {
        return false;
    }
}

async function getAbout(client, number) {
    let waNumber = number + "@s.whatsapp.net";
    try {
        let { status, setAt } = await getStatusData(client, waNumber);
        return { status, setAt };
    } catch {
        return { status: "NO ABOUT AVAILABLE", setAt: "Unknown" };
    }
}

function generateNumbers(baseNumber) {
    let rawInput = baseNumber.replace(/[^0-9x]/g, "");
    let xPositions = [...rawInput].map((char, i) => (char === "x" ? i : -1)).filter(i => i !== -1);

    if (xPositions.length === 0) return [];
    if (xPositions.length > 3) return null;

    let possibleNumbers = [];
    let rangeLimit = Math.pow(10, xPositions.length);

    for (let i = 0; i < rangeLimit; i++) {
        let numArray = [...rawInput];
        let replacement = i.toString().padStart(xPositions.length, "0");

        xPositions.forEach((pos, index) => {
            numArray[pos] = replacement[index];
        });

        possibleNumbers.push(numArray.join(""));
    }

    return possibleNumbers;
}

module.exports = { isOnWhatsApp, isPfp, getAbout, generateNumbers, getStatusData };
