/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_ArtistInputs */

const uk_tag_editor_artist = /** @type {(inputs: Tag_Editor_ArtistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Виконавець`)
};

const en_tag_editor_artist = /** @type {(inputs: Tag_Editor_ArtistInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Artist`)
};

/**
* | output |
* | --- |
* | "Artist" |
*
* @param {Tag_Editor_ArtistInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_artist = /** @type {((inputs?: Tag_Editor_ArtistInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_ArtistInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_artist(inputs)
	return en_tag_editor_artist(inputs)
});