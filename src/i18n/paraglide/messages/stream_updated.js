/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stream_UpdatedInputs */

const uk_stream_updated = /** @type {(inputs: Stream_UpdatedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Потік оновлено: ${i?.name}`)
};

const en_stream_updated = /** @type {(inputs: Stream_UpdatedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stream updated: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stream updated: {name}" |
*
* @param {Stream_UpdatedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_updated = /** @type {((inputs: Stream_UpdatedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_UpdatedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_updated(inputs)
	return en_stream_updated(inputs)
});