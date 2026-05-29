/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Songs_Toast_DeletedInputs */

const uk_songs_toast_deleted = /** @type {(inputs: Songs_Toast_DeletedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Пісню видалено`)
};

const en_songs_toast_deleted = /** @type {(inputs: Songs_Toast_DeletedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Song deleted`)
};

/**
* | output |
* | --- |
* | "Song deleted" |
*
* @param {Songs_Toast_DeletedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_toast_deleted = /** @type {((inputs?: Songs_Toast_DeletedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Toast_DeletedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_toast_deleted(inputs)
	return en_songs_toast_deleted(inputs)
});