/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Add_StreamInputs */

const uk_add_stream = /** @type {(inputs: Add_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Додати потік`)
};

const en_add_stream = /** @type {(inputs: Add_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Add stream`)
};

/**
* | output |
* | --- |
* | "Add stream" |
*
* @param {Add_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const add_stream = /** @type {((inputs?: Add_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Add_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_add_stream(inputs)
	return en_add_stream(inputs)
});