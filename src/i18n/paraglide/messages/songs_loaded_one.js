/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Songs_Loaded_OneInputs */

const uk_songs_loaded_one = /** @type {(inputs: Songs_Loaded_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Знайдено ${i?.count} пісню`)
};

const en_songs_loaded_one = /** @type {(inputs: Songs_Loaded_OneInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Found ${i?.count} song`)
};

/**
* | output |
* | --- |
* | "Found {count} song" |
*
* @param {Songs_Loaded_OneInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_loaded_one = /** @type {((inputs: Songs_Loaded_OneInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Loaded_OneInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_loaded_one(inputs)
	return en_songs_loaded_one(inputs)
});