/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ fileName: NonNullable<unknown> }} Songs_Confirm_Delete_BodyInputs */

const uk_songs_confirm_delete_body = /** @type {(inputs: Songs_Confirm_Delete_BodyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Файл буде переміщено у Кошик: ${i?.fileName}`)
};

const en_songs_confirm_delete_body = /** @type {(inputs: Songs_Confirm_Delete_BodyInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`File will be moved to the Recycle Bin: ${i?.fileName}`)
};

/**
* | output |
* | --- |
* | "File will be moved to the Recycle Bin: {fileName}" |
*
* @param {Songs_Confirm_Delete_BodyInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const songs_confirm_delete_body = /** @type {((inputs: Songs_Confirm_Delete_BodyInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Songs_Confirm_Delete_BodyInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_songs_confirm_delete_body(inputs)
	return en_songs_confirm_delete_body(inputs)
});