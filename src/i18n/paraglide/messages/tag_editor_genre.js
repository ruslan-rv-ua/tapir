/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_GenreInputs */

const uk_tag_editor_genre = /** @type {(inputs: Tag_Editor_GenreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Жанр`)
};

const en_tag_editor_genre = /** @type {(inputs: Tag_Editor_GenreInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Genre`)
};

/**
* | output |
* | --- |
* | "Genre" |
*
* @param {Tag_Editor_GenreInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_genre = /** @type {((inputs?: Tag_Editor_GenreInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_GenreInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_genre(inputs)
	return en_tag_editor_genre(inputs)
});