/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Live_StreamInputs */

const uk_live_stream = /** @type {(inputs: Live_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Живий потік`)
};

const en_live_stream = /** @type {(inputs: Live_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Live stream`)
};

/**
* | output |
* | --- |
* | "Live stream" |
*
* @param {Live_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const live_stream = /** @type {((inputs?: Live_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Live_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_live_stream(inputs)
	return en_live_stream(inputs)
});