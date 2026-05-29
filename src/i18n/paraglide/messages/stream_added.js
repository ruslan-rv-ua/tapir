/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stream_AddedInputs */

const uk_stream_added = /** @type {(inputs: Stream_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Потік додано: ${i?.name}`)
};

const en_stream_added = /** @type {(inputs: Stream_AddedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stream added: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stream added: {name}" |
*
* @param {Stream_AddedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_added = /** @type {((inputs: Stream_AddedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_AddedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_added(inputs)
	return en_stream_added(inputs)
});