/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ newName: NonNullable<unknown> }} Songs_Toast_RenamedInputs */

const uk_songs_toast_renamed = /** @type {(inputs: Songs_Toast_RenamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Файл перейменовано на ${i?.newName}`)
};

const en_songs_toast_renamed = /** @type {(inputs: Songs_Toast_RenamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`File renamed to ${i?.newName}`)
};

/**
* | output |
* | --- |
* | "File renamed to {newName}" |
*
* @param {Songs_Toast_RenamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_toast_renamed = /** @type {((inputs: Songs_Toast_RenamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Toast_RenamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_toast_renamed(inputs)
	return en_songs_toast_renamed(inputs)
});