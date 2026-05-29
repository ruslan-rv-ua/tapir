/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Rename_Dialog_Unsaved_ConfirmInputs */

const uk_rename_dialog_unsaved_confirm = /** @type {(inputs: Rename_Dialog_Unsaved_ConfirmInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Ім'я змінено. Закрити без збереження?`)
};

const en_rename_dialog_unsaved_confirm = /** @type {(inputs: Rename_Dialog_Unsaved_ConfirmInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Name was changed. Close without saving?`)
};

/**
* | output |
* | --- |
* | "Name was changed. Close without saving?" |
*
* @param {Rename_Dialog_Unsaved_ConfirmInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const rename_dialog_unsaved_confirm = /** @type {((inputs?: Rename_Dialog_Unsaved_ConfirmInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Rename_Dialog_Unsaved_ConfirmInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_rename_dialog_unsaved_confirm(inputs)
	return en_rename_dialog_unsaved_confirm(inputs)
});