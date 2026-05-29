/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Remove_StreamInputs */

const uk_remove_stream = /** @type {(inputs: Remove_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити потік`)
};

const en_remove_stream = /** @type {(inputs: Remove_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Remove stream`)
};

/**
* | output |
* | --- |
* | "Remove stream" |
*
* @param {Remove_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const remove_stream = /** @type {((inputs?: Remove_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Remove_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_remove_stream(inputs)
	return en_remove_stream(inputs)
});