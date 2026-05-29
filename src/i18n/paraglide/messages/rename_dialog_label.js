/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Rename_Dialog_LabelInputs */

const uk_rename_dialog_label = /** @type {(inputs: Rename_Dialog_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Нове ім'я (без розширення)`)
};

const en_rename_dialog_label = /** @type {(inputs: Rename_Dialog_LabelInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`New name (without extension)`)
};

/**
* | output |
* | --- |
* | "New name (without extension)" |
*
* @param {Rename_Dialog_LabelInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const rename_dialog_label = /** @type {((inputs?: Rename_Dialog_LabelInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Rename_Dialog_LabelInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_rename_dialog_label(inputs)
	return en_rename_dialog_label(inputs)
});