/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Browser_Column_BitrateInputs */

const uk_browser_column_bitrate = /** @type {(inputs: Browser_Column_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Бітрейт`)
};

const en_browser_column_bitrate = /** @type {(inputs: Browser_Column_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Bitrate`)
};

/**
* | output |
* | --- |
* | "Bitrate" |
*
* @param {Browser_Column_BitrateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const browser_column_bitrate = /** @type {((inputs?: Browser_Column_BitrateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Browser_Column_BitrateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_browser_column_bitrate(inputs)
	return en_browser_column_bitrate(inputs)
});