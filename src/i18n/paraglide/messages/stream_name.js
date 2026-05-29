/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stream_NameInputs */

const uk_stream_name = /** @type {(inputs: Stream_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Назва (опціонально)`)
};

const en_stream_name = /** @type {(inputs: Stream_NameInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Name (optional)`)
};

/**
* | output |
* | --- |
* | "Name (optional)" |
*
* @param {Stream_NameInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_name = /** @type {((inputs?: Stream_NameInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_NameInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_name(inputs)
	return en_stream_name(inputs)
});