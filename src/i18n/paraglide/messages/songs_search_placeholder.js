/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Search_PlaceholderInputs */

const uk_songs_search_placeholder = /** @type {(inputs: Songs_Search_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пошук по виконавцю, треку чи альбому`)
};

const en_songs_search_placeholder = /** @type {(inputs: Songs_Search_PlaceholderInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Search by artist, track or album`)
};

/**
* | output |
* | --- |
* | "Search by artist, track or album" |
*
* @param {Songs_Search_PlaceholderInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_search_placeholder = /** @type {((inputs?: Songs_Search_PlaceholderInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Search_PlaceholderInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_search_placeholder(inputs)
	return en_songs_search_placeholder(inputs)
});