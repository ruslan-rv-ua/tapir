/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Live_Stream_ShortInputs */

const uk_live_stream_short = /** @type {(inputs: Live_Stream_ShortInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`LIVE`)
};

const en_live_stream_short = /** @type {(inputs: Live_Stream_ShortInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`LIVE`)
};

/**
* | output |
* | --- |
* | "LIVE" |
*
* @param {Live_Stream_ShortInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const live_stream_short = /** @type {((inputs?: Live_Stream_ShortInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Live_Stream_ShortInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_live_stream_short(inputs)
	return en_live_stream_short(inputs)
});