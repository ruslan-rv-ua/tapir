/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_Song_TitleInputs */

const uk_tag_editor_song_title = /** @type {(inputs: Tag_Editor_Song_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Назва треку`)
};

const en_tag_editor_song_title = /** @type {(inputs: Tag_Editor_Song_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Track title`)
};

/**
* | output |
* | --- |
* | "Track title" |
*
* @param {Tag_Editor_Song_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_song_title = /** @type {((inputs?: Tag_Editor_Song_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_Song_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_song_title(inputs)
	return en_tag_editor_song_title(inputs)
});