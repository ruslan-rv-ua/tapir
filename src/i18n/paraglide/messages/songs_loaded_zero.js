/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Loaded_ZeroInputs */

const uk_songs_loaded_zero = /** @type {(inputs: Songs_Loaded_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Немає збережених пісень`)
};

const en_songs_loaded_zero = /** @type {(inputs: Songs_Loaded_ZeroInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No saved songs`)
};

/**
* | output |
* | --- |
* | "No saved songs" |
*
* @param {Songs_Loaded_ZeroInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_loaded_zero = /** @type {((inputs?: Songs_Loaded_ZeroInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Loaded_ZeroInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_loaded_zero(inputs)
	return en_songs_loaded_zero(inputs)
});