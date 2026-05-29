/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Rename_Dialog_Invalid_CharsInputs */

const uk_rename_dialog_invalid_chars = /** @type {(inputs: Rename_Dialog_Invalid_CharsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Символи < > : " / \\ | ? * не дозволені`)
};

const en_rename_dialog_invalid_chars = /** @type {(inputs: Rename_Dialog_Invalid_CharsInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Characters < > : " / \\ | ? * are not allowed`)
};

/**
* | output |
* | --- |
* | "Characters < > : \" / \\ \| ? * are not allowed" |
*
* @param {Rename_Dialog_Invalid_CharsInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const rename_dialog_invalid_chars = /** @type {((inputs?: Rename_Dialog_Invalid_CharsInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Rename_Dialog_Invalid_CharsInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_rename_dialog_invalid_chars(inputs)
	return en_rename_dialog_invalid_chars(inputs)
});