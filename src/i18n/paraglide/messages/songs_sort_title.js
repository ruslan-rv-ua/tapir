/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Sort_TitleInputs */

const uk_songs_sort_title = /** @type {(inputs: Songs_Sort_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`За назвою`)
};

const en_songs_sort_title = /** @type {(inputs: Songs_Sort_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`By title`)
};

/**
* | output |
* | --- |
* | "By title" |
*
* @param {Songs_Sort_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_sort_title = /** @type {((inputs?: Songs_Sort_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Sort_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_sort_title(inputs)
	return en_songs_sort_title(inputs)
});