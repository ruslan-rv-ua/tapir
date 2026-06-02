/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Delete_NamedInputs */

const uk_profile_delete_named = /** @type {(inputs: Profile_Delete_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Видалити ${i?.name}`)
};

const en_profile_delete_named = /** @type {(inputs: Profile_Delete_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Delete ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Delete {name}" |
*
* @param {Profile_Delete_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_delete_named = /** @type {((inputs: Profile_Delete_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Delete_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_delete_named(inputs)
	return en_profile_delete_named(inputs)
});