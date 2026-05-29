/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_AlbumInputs */

const uk_tag_editor_album = /** @type {(inputs: Tag_Editor_AlbumInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Альбом`)
};

const en_tag_editor_album = /** @type {(inputs: Tag_Editor_AlbumInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Album`)
};

/**
* | output |
* | --- |
* | "Album" |
*
* @param {Tag_Editor_AlbumInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_album = /** @type {((inputs?: Tag_Editor_AlbumInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_AlbumInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_album(inputs)
	return en_tag_editor_album(inputs)
});