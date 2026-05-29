/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Confirm_Delete_StreamInputs */

const uk_confirm_delete_stream = /** @type {(inputs: Confirm_Delete_StreamInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Видалити потік "${i?.name}"?`)
};

const en_confirm_delete_stream = /** @type {(inputs: Confirm_Delete_StreamInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Delete stream "${i?.name}"?`)
};

/**
* | output |
* | --- |
* | "Delete stream \"{name}\"?" |
*
* @param {Confirm_Delete_StreamInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const confirm_delete_stream = /** @type {((inputs: Confirm_Delete_StreamInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Confirm_Delete_StreamInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_confirm_delete_stream(inputs)
	return en_confirm_delete_stream(inputs)
});