/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Stream_RemovedInputs */

const uk_stream_removed = /** @type {(inputs: Stream_RemovedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Потік видалено: ${i?.name}`)
};

const en_stream_removed = /** @type {(inputs: Stream_RemovedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Stream removed: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Stream removed: {name}" |
*
* @param {Stream_RemovedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stream_removed = /** @type {((inputs: Stream_RemovedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stream_RemovedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stream_removed(inputs)
	return en_stream_removed(inputs)
});