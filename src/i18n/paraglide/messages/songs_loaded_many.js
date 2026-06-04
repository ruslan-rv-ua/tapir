/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ count: NonNullable<unknown> }} Songs_Loaded_ManyInputs */

const uk_songs_loaded_many = /** @type {(inputs: Songs_Loaded_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Знайдено ${i?.count} записів`)
};

const en_songs_loaded_many = /** @type {(inputs: Songs_Loaded_ManyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Found ${i?.count} recordings`)
};

/**
* | output |
* | --- |
* | "Found {count} recordings" |
*
* @param {Songs_Loaded_ManyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_loaded_many = /** @type {((inputs: Songs_Loaded_ManyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Loaded_ManyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_loaded_many(inputs)
	return en_songs_loaded_many(inputs)
});