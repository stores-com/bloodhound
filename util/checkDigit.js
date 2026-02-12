module.exports = (trackingNumber, multipliers, mod) => {
    let midx = 0;
    let sum = 0;
    let checkDigit, i, index, ref;

    for (index = i = 0, ref = trackingNumber.length - 2; (0 <= ref ? i <= ref : i >= ref); index = 0 <= ref ? ++i : --i) {
        sum += parseInt(trackingNumber[index], 10) * multipliers[midx];
        midx = midx === multipliers.length - 1 ? 0 : midx + 1;
    }

    if (mod === 11) {
        checkDigit = sum % 11;

        if (checkDigit === 10) {
            checkDigit = 0;
        }
    }

    if (mod === 10) {
        checkDigit = 0;

        if ((sum % 10) > 0) {
            checkDigit = 10 - sum % 10;
        }
    }

    return checkDigit === parseInt(trackingNumber[trackingNumber.length - 1]);
};