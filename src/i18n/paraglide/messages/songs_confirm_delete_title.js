/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Confirm_Delete_TitleInputs */

const uk_songs_confirm_delete_title = /** @type {(inputs: Songs_Confirm_Delete_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити пісню?`)
};

const en_songs_confirm_delete_title = /** @type {(inputs: Songs_Confirm_Delete_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Delete song?`)
};

/**
* | output |
* | --- |
* | "Delete song?" |
*
* @param {Songs_Confirm_Delete_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_confirm_delete_title = /** @type {((inputs?: Songs_Confirm_Delete_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Confirm_Delete_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_confirm_delete_title(inputs)
	return en_songs_confirm_delete_title(inputs)
});