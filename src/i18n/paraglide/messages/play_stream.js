/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Play_StreamInputs */

const uk_play_stream = /** @type {(inputs: Play_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворити потік`)
};

const en_play_stream = /** @type {(inputs: Play_StreamInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Play stream`)
};

/**
* | output |
* | --- |
* | "Play stream" |
*
* @param {Play_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const play_stream = /** @type {((inputs?: Play_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Play_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_play_stream(inputs)
	return en_play_stream(inputs)
});