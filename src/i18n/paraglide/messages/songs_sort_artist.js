/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Sort_ArtistInputs */

const uk_songs_sort_artist = /** @type {(inputs: Songs_Sort_ArtistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`За виконавцем`)
};

const en_songs_sort_artist = /** @type {(inputs: Songs_Sort_ArtistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`By artist`)
};

/**
* | output |
* | --- |
* | "By artist" |
*
* @param {Songs_Sort_ArtistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_sort_artist = /** @type {((inputs?: Songs_Sort_ArtistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Sort_ArtistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_sort_artist(inputs)
	return en_songs_sort_artist(inputs)
});