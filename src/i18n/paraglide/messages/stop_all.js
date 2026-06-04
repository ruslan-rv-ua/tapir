/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stop_AllInputs */

const uk_stop_all = /** @type {(inputs: Stop_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити запис`)
};

const en_stop_all = /** @type {(inputs: Stop_AllInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop recording`)
};

/**
* | output |
* | --- |
* | "Stop recording" |
*
* @param {Stop_AllInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop_all = /** @type {((inputs?: Stop_AllInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stop_AllInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop_all(inputs)
	return en_stop_all(inputs)
});