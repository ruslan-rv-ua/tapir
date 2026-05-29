/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Rename_Dialog_SaveInputs */

const uk_rename_dialog_save = /** @type {(inputs: Rename_Dialog_SaveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Перейменувати`)
};

const en_rename_dialog_save = /** @type {(inputs: Rename_Dialog_SaveInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Rename`)
};

/**
* | output |
* | --- |
* | "Rename" |
*
* @param {Rename_Dialog_SaveInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const rename_dialog_save = /** @type {((inputs?: Rename_Dialog_SaveInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Rename_Dialog_SaveInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_rename_dialog_save(inputs)
	return en_rename_dialog_save(inputs)
});