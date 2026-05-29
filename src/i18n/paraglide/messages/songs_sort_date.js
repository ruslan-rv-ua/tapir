/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Sort_DateInputs */

const uk_songs_sort_date = /** @type {(inputs: Songs_Sort_DateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`За датою`)
};

const en_songs_sort_date = /** @type {(inputs: Songs_Sort_DateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`By date`)
};

/**
* | output |
* | --- |
* | "By date" |
*
* @param {Songs_Sort_DateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_sort_date = /** @type {((inputs?: Songs_Sort_DateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Sort_DateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_sort_date(inputs)
	return en_songs_sort_date(inputs)
});