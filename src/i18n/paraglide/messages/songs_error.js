/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ error: NonNullable<unknown> }} Songs_ErrorInputs */

const uk_songs_error = /** @type {(inputs: Songs_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Не вдалось завантажити список: ${i?.error}`)
};

const en_songs_error = /** @type {(inputs: Songs_ErrorInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Failed to load: ${i?.error}`)
};

/**
* | output |
* | --- |
* | "Failed to load: {error}" |
*
* @param {Songs_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_error = /** @type {((inputs: Songs_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_error(inputs)
	return en_songs_error(inputs)
});