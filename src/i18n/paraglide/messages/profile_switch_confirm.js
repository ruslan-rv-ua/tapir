/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Profile_Switch_ConfirmInputs */

const uk_profile_switch_confirm = /** @type {(inputs: Profile_Switch_ConfirmInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Є активні записи. Зупинити їх і перейти до "${i?.name}"?`)
};

const en_profile_switch_confirm = /** @type {(inputs: Profile_Switch_ConfirmInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Active recordings exist. Stop them and switch to "${i?.name}"?`)
};

/**
* | output |
* | --- |
* | "Active recordings exist. Stop them and switch to \"{name}\"?" |
*
* @param {Profile_Switch_ConfirmInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_switch_confirm = /** @type {((inputs: Profile_Switch_ConfirmInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Switch_ConfirmInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_switch_confirm(inputs)
	return en_profile_switch_confirm(inputs)
});