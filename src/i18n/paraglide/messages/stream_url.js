/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stream_UrlInputs */

const uk_stream_url = /** @type {(inputs: Stream_UrlInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`URL потоку`)
};

const en_stream_url = /** @type {(inputs: Stream_UrlInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stream URL`)
};

/**
* | output |
* | --- |
* | "Stream URL" |
*
* @param {Stream_UrlInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_url = /** @type {((inputs?: Stream_UrlInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_UrlInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_url(inputs)
	return en_stream_url(inputs)
});