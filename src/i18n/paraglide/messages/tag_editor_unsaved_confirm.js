/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Tag_Editor_Unsaved_ConfirmInputs */

const uk_tag_editor_unsaved_confirm = /** @type {(inputs: Tag_Editor_Unsaved_ConfirmInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`У вас є незбережені зміни. Закрити без збереження?`)
};

const en_tag_editor_unsaved_confirm = /** @type {(inputs: Tag_Editor_Unsaved_ConfirmInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`You have unsaved changes. Close without saving?`)
};

/**
* | output |
* | --- |
* | "You have unsaved changes. Close without saving?" |
*
* @param {Tag_Editor_Unsaved_ConfirmInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const tag_editor_unsaved_confirm = /** @type {((inputs?: Tag_Editor_Unsaved_ConfirmInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Tag_Editor_Unsaved_ConfirmInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_tag_editor_unsaved_confirm(inputs)
	return en_tag_editor_unsaved_confirm(inputs)
});