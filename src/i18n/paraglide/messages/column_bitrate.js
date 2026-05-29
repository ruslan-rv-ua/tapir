/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Column_BitrateInputs */

const uk_column_bitrate = /** @type {(inputs: Column_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Бітрейт`)
};

const en_column_bitrate = /** @type {(inputs: Column_BitrateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Bitrate`)
};

/**
* | output |
* | --- |
* | "Bitrate" |
*
* @param {Column_BitrateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const column_bitrate = /** @type {((inputs?: Column_BitrateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Column_BitrateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_column_bitrate(inputs)
	return en_column_bitrate(inputs)
});