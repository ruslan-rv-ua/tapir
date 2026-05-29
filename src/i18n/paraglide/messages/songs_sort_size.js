/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Sort_SizeInputs */

const uk_songs_sort_size = /** @type {(inputs: Songs_Sort_SizeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`За розміром`)
};

const en_songs_sort_size = /** @type {(inputs: Songs_Sort_SizeInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`By size`)
};

/**
* | output |
* | --- |
* | "By size" |
*
* @param {Songs_Sort_SizeInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_sort_size = /** @type {((inputs?: Songs_Sort_SizeInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Sort_SizeInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_sort_size(inputs)
	return en_songs_sort_size(inputs)
});