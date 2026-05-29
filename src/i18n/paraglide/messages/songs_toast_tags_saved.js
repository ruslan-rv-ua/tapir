/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Toast_Tags_SavedInputs */

const uk_songs_toast_tags_saved = /** @type {(inputs: Songs_Toast_Tags_SavedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Теги оновлено`)
};

const en_songs_toast_tags_saved = /** @type {(inputs: Songs_Toast_Tags_SavedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Tags updated`)
};

/**
* | output |
* | --- |
* | "Tags updated" |
*
* @param {Songs_Toast_Tags_SavedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_toast_tags_saved = /** @type {((inputs?: Songs_Toast_Tags_SavedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Toast_Tags_SavedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_toast_tags_saved(inputs)
	return en_songs_toast_tags_saved(inputs)
});