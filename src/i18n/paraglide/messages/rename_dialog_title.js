/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Rename_Dialog_TitleInputs */

const uk_rename_dialog_title = /** @type {(inputs: Rename_Dialog_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перейменувати файл`)
};

const en_rename_dialog_title = /** @type {(inputs: Rename_Dialog_TitleInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Rename file`)
};

/**
* | output |
* | --- |
* | "Rename file" |
*
* @param {Rename_Dialog_TitleInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const rename_dialog_title = /** @type {((inputs?: Rename_Dialog_TitleInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Rename_Dialog_TitleInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_rename_dialog_title(inputs)
	return en_rename_dialog_title(inputs)
});